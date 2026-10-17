// Immunity is a flag on each villager (Michael, 2026-10-18, #180: "any villager who teaches a skill is immune to the dead, like the
// guide; everyone else can die... on top of the steady villagers, there needs to be some redshirts who are there to be at risk"): the
// dead neither target nor harm an immune villager whatever the world's rules, and an at-risk one is hunted and hurt when the rule is on.
// From the console, on a tab with `?nosave`:
//   await __game.check("immune")
// It makes two villagers on open ground (one immune), sets one of the dead on them with "Zombies attack villagers" on, and takes them
// away and puts the rule and the dead back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const S = G.game.state;
  const { createVillager } = await import("/src/entities/villager.js");
  const wasPaused = G.loop.isPaused();
  const rules0 = { zombieAggro: G.rules.rules.zombieAggro, zombiesAttackVillagers: G.rules.rules.zombiesAttackVillagers };
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  try {
    G.loop.setPaused(true);
    row("the valley has villagers who cannot be harmed and villagers who can", S.villagers.some((v) => v.immune) && S.villagers.filter((v) => !v.immune).length >= 3, `${S.villagers.filter((v) => v.immune).length} immune, ${S.villagers.filter((v) => !v.immune).length} at risk`);
    G.clock.setHour(12);
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let dy = -5; dy <= 5 && clear; dy++) for (let dx = -6; dx <= 6 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w && !G.map.tileAt(x + dx, y + dy).prop;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    G.teleport(cx + 25, cy + 25); // near enough that the dead here think (`activeTiles`), far enough that they do not see the player: the villagers are the only prey
    G.rules.set({ zombieAggro: true, zombiesAttackVillagers: true });
    const z = S.zombies.find((q) => !q.dead && !q.corpse);
    const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro };
    restore.push(() => Object.assign(z, z0, { path: [], target: null, lastSeen: null, siege: null }));
    for (const o of S.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 60) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    const safe = createVillager(cx - 2, cy, { id: "vt_immune", name: "Teacher", immune: true });
    const prey = createVillager(cx + 2, cy, { id: "vt_prey", name: "Redshirt" });
    S.villagers.push(safe, prey);
    // What the test made is taken away by identity: a villager the dead killed has already left the list (it turned), and the zombie it
    // became, with anything else the run added to the dead, goes too.
    const dead0 = new Set(S.zombies);
    const takeVillager = (v) => { const i = S.villagers.indexOf(v); if (i >= 0) S.villagers.splice(i, 1); };
    restore.push(() => {
      takeVillager(safe);
      takeVillager(prey);
      for (let i = S.zombies.length - 1; i >= 0; i--) if (!dead0.has(S.zombies[i])) S.zombies.splice(i, 1);
    });
    z.gx = cx;
    z.gy = cy + 3;
    z.path = [];
    z.state = "idle";
    z.aggro = true;
    z.target = null;
    z.siege = null;
    z.noWay = 0;
    let everTargeted = false; // sampled every step: the dead never so much as target the immune one
    for (let i = 0; i < 60 * 25; i++) {
      step(1);
      if (z.target === safe) everTargeted = true;
    }
    row("the dead hunt and hurt an at-risk villager", prey.hp < prey.maxHp, `Redshirt ${prey.hp.toFixed(0)} of ${prey.maxHp}${prey.dead ? ", dead" : ""}`);
    row("and never an immune one: it is neither targeted (at any step) nor harmed", safe.hp === safe.maxHp && !safe.dead && !everTargeted, `Teacher ${safe.hp} of ${safe.maxHp}`);
    G.events.emit("villagerHit", { zombie: z, villager: safe, damage: 50 });
    row("a blow that reaches an immune villager does nothing", safe.hp === safe.maxHp, `Teacher ${safe.hp}`);
    G.rules.set({ zombiesAttackVillagers: false });
    const spare = createVillager(cx + 1, cy + 1, { id: "vt_spare", name: "Spare" }); // the first redshirt is dead by now
    S.villagers.push(spare);
    restore.push(() => takeVillager(spare));
    z.state = "idle";
    z.target = null;
    z.gx = cx;
    z.gy = cy + 3;
    z.path = [];
    step(60 * 8);
    row("with the world's rule off, the dead leave an at-risk villager alone too", spare.hp === spare.maxHp && !spare.dead, `Spare ${spare.hp.toFixed(0)} of ${spare.maxHp}`);
  } finally {
    for (const r of restore.reverse()) r();
    G.rules.set(rules0);
    G.clock.setHour(hour0);
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
